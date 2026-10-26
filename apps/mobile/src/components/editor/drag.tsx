import type { SlotPlace } from '@lift/domain/workouts';
import * as Haptics from 'expo-haptics';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

/**
 * Drag and drop for the workout editor, built on gesture-handler and
 * reanimated rather than a sortable-list library.
 *
 * A library lays its items out itself, as one flat list. The editor needs
 * what the web's dnd-kit version does: circuits drawn as cards with their
 * members inside, insert rows between every slot, and two drop targets a
 * sortable list has no idea of. So this does the drag itself.
 *
 * - **Lift.** A row held for `LIFT_MS` lifts into a floating copy that follows
 *   the finger. The list does not reflow while dragging; the place a drop
 *   would land lights up instead, which reads the same and keeps every
 *   measured position valid for the whole drag.
 * - **Move.** The drop target is the gap nearest the finger: the same gaps
 *   the insert rows sit in. A gap belongs to a circuit or to none, so dropping
 *   in a card joins it and dropping just outside one leaves it
 *   (`moveSlot` in @lift/domain/workouts).
 * - **Group.** Hovering over the middle of another row for `GROUP_DWELL_MS`
 *   arms "make a circuit with that one", the web's folder-drop. The target
 *   says so before release.
 * - **Scroll.** Near the top or bottom edge the list scrolls under the row.
 *
 * Everything is measured once, when the row lifts, in window coordinates. The
 * scroll offset since then is the only thing that changes, so hit-testing a
 * move is arithmetic, not measurement.
 */

/** Hold before a row lifts. Long enough that a scroll or a swipe never lifts one. */
export const LIFT_MS = 300;

/** Hover over a row this long and the drop means "make a circuit". As the web. */
const GROUP_DWELL_MS = 420;

/** The middle band of a row that counts as "over it", as a fraction of its height. */
const GROUP_BAND = [0.25, 0.75] as const;

/** Distance from an edge of the list at which it starts to scroll, and how fast. */
const SCROLL_EDGE = 80;
const SCROLL_MAX_SPEED = 14;

/** A mounted View, as a ref receives it. */
export type ViewHandle = ComponentRef<typeof View>;

type Rect = { x: number; y: number; width: number; height: number };

export type DropTarget =
  | { kind: 'gap'; key: string; place: SlotPlace }
  /** `armed` once the hover has lasted long enough for a drop to group. */
  | { kind: 'group'; slotId: string; armed: boolean };

/** What the current drag would do, for the rows and gaps to show. */
export type DragView = { slotId: string; target: DropTarget | null };

type Session = {
  slotId: string;
  /** Last finger height, in gesture (window) coordinates. */
  y: number;
  /** Where in the row the finger took hold. */
  grabY: number;
  ready: boolean;
  rows: Map<string, Rect>;
  gaps: { key: string; place: SlotPlace; rect: Rect }[];
  container: Rect;
  scrollAtStart: number;
  target: DropTarget | null;
  dwell: ReturnType<typeof setTimeout> | null;
  speed: number;
  frame: number | null;
};

type Registry = {
  rows: Map<string, ViewHandle>;
  gaps: Map<string, { view: ViewHandle; place: SlotPlace }>;
};

type DragContextValue = {
  view: DragView | null;
  registry: Registry;
  begin: (slotId: string, absoluteY: number, localY: number) => void;
  move: (absoluteY: number) => void;
  end: (canceled: boolean) => void;
};

const DragContext = createContext<DragContextValue | null>(null);

function useDrag(): DragContextValue {
  const value = useContext(DragContext);
  if (value === null) throw new Error('Drag rows and gaps must sit inside a DragScrollView');
  return value;
}

/** The current drag, or null. Re-renders only when the target changes, not per move. */
export function useDragView(): DragView | null {
  return useDrag().view;
}

/** Callbacks for a draggable row's pan gesture. */
export function useDragHandlers(): Pick<DragContextValue, 'begin' | 'move' | 'end'> {
  const { begin, move, end } = useDrag();
  return { begin, move, end };
}

/** A ref for a row, so the drag can measure it. */
export function useRowRef(slotId: string): (view: ViewHandle | null) => () => void {
  const { registry } = useDrag();
  return useCallback(
    (view: ViewHandle | null) => {
      if (view !== null) registry.rows.set(slotId, view);
      return () => {
        registry.rows.delete(slotId);
      };
    },
    [registry, slotId],
  );
}

/** A ref for a gap, so the drag can measure it and drop into it. */
export function useGapRef(key: string, place: SlotPlace): (view: ViewHandle | null) => () => void {
  const { registry } = useDrag();
  const { before, group } = place;
  return useCallback(
    (view: ViewHandle | null) => {
      if (view !== null) registry.gaps.set(key, { view, place: { before, group } });
      return () => {
        registry.gaps.delete(key);
      };
    },
    [registry, key, before, group],
  );
}

function measure(view: ViewHandle): Promise<Rect> {
  return new Promise((resolve) => {
    view.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height });
    });
  });
}

function shift(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

function stopDwell(current: Session): void {
  if (current.dwell !== null) clearTimeout(current.dwell);
  current.dwell = null;
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === 'gap' && b.kind === 'gap') return a.key === b.key;
  if (a.kind === 'group' && b.kind === 'group') return a.slotId === b.slotId && a.armed === b.armed;
  return false;
}

type Props = {
  /** Whether the dragged row may be grouped with this one. */
  canGroup: (slotId: string, targetId: string) => boolean;
  onDropGap: (slotId: string, place: SlotPlace) => void;
  onDropGroup: (slotId: string, targetId: string) => void;
  /** The floating copy of the dragged row. */
  renderDragged: (slotId: string) => ReactNode;
  contentContainerStyle?: ComponentProps<typeof ScrollView>['contentContainerStyle'];
  children: ReactNode;
};

/**
 * The editor's scroll view, with the drag layer over it.
 *
 * gesture-handler's ScrollView rather than React Native's, so a lifted row's
 * pan and the list's own scrolling know about each other; scrolling is also
 * switched off for the length of a drag, and done by the edge scroll instead.
 */
export function DragScrollView({
  canGroup,
  onDropGap,
  onDropGroup,
  renderDragged,
  contentContainerStyle,
  children,
}: Props) {
  const registry = useMemo<Registry>(() => ({ rows: new Map(), gaps: new Map() }), []);
  const containerRef = useRef<ViewHandle>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const contentHeight = useRef(0);
  const session = useRef<Session | null>(null);

  const [view, setView] = useState<DragView | null>(null);
  const [overlay, setOverlay] = useState<{ left: number; width: number } | null>(null);
  const overlayY = useSharedValue(0);
  const overlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: overlayY.value }, { scale: 1.03 }],
  }));

  // The latest callbacks, read at drop time: a drag outlives many renders.
  const handlers = useRef({ canGroup, onDropGap, onDropGroup });
  useEffect(() => {
    handlers.current = { canGroup, onDropGap, onDropGroup };
  });

  const publish = useCallback((next: DropTarget | null): void => {
    const current = session.current;
    if (current === null || sameTarget(current.target, next)) return;
    current.target = next;
    setView({ slotId: current.slotId, target: next });
  }, []);

  const hitTest = useCallback((): void => {
    const current = session.current;
    if (current?.ready !== true) return;

    // The finger in the coordinates everything was measured in: the content
    // has scrolled up by however far the list scrolled since the lift.
    const y = current.y + (scrollY.current - current.scrollAtStart);

    let over: string | null = null;
    for (const [slotId, rect] of current.rows) {
      if (slotId === current.slotId) continue;
      const top = rect.y + rect.height * GROUP_BAND[0];
      const bottom = rect.y + rect.height * GROUP_BAND[1];
      if (y >= top && y <= bottom && handlers.current.canGroup(current.slotId, slotId)) {
        over = slotId;
        break;
      }
    }

    if (over !== null) {
      const previous = current.target;
      if (previous?.kind === 'group' && previous.slotId === over) return;
      stopDwell(current);
      publish({ kind: 'group', slotId: over, armed: false });
      const target = over;
      current.dwell = setTimeout(() => {
        current.dwell = null;
        if (session.current !== current) return;
        publish({ kind: 'group', slotId: target, armed: true });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }, GROUP_DWELL_MS);
      return;
    }

    stopDwell(current);
    let nearest: Session['gaps'][number] | null = null;
    let distance = Infinity;
    for (const gap of current.gaps) {
      const gapDistance = Math.abs(y - (gap.rect.y + gap.rect.height / 2));
      if (gapDistance < distance) {
        distance = gapDistance;
        nearest = gap;
      }
    }
    const next: DropTarget | null =
      nearest === null ? null : { kind: 'gap', key: nearest.key, place: nearest.place };
    if (next !== null && !sameTarget(current.target, next)) void Haptics.selectionAsync();
    publish(next);
  }, [publish]);

  const autoScroll = useCallback(
    (current: Session): void => {
      const { y: top, height } = current.container;
      const bottom = top + height;
      let speed = 0;
      if (current.y < top + SCROLL_EDGE) {
        speed = -SCROLL_MAX_SPEED * Math.min(1, (top + SCROLL_EDGE - current.y) / SCROLL_EDGE);
      } else if (current.y > bottom - SCROLL_EDGE) {
        speed = SCROLL_MAX_SPEED * Math.min(1, (current.y - (bottom - SCROLL_EDGE)) / SCROLL_EDGE);
      }
      current.speed = speed;
      if (speed === 0 || current.frame !== null) return;

      function tick(): void {
        if (session.current !== current || current.speed === 0) {
          current.frame = null;
          return;
        }
        const max = Math.max(0, contentHeight.current - current.container.height);
        const next = Math.min(max, Math.max(0, scrollY.current + current.speed));
        if (next !== scrollY.current) {
          scrollY.current = next;
          scrollRef.current?.scrollTo({ y: next, animated: false });
          hitTest();
        }
        current.frame = requestAnimationFrame(tick);
      }
      current.frame = requestAnimationFrame(tick);
    },
    [hitTest],
  );

  const begin = useCallback(
    (slotId: string, absoluteY: number, localY: number): void => {
      if (session.current !== null) return;
      const rowView = registry.rows.get(slotId);
      const container = containerRef.current;
      if (rowView === undefined || container === null) return;

      const current: Session = {
        slotId,
        y: absoluteY,
        grabY: localY,
        ready: false,
        rows: new Map(),
        gaps: [],
        container: { x: 0, y: 0, width: 0, height: 0 },
        scrollAtStart: scrollY.current,
        target: null,
        dwell: null,
        speed: 0,
        frame: null,
      };
      session.current = current;
      setView({ slotId, target: null });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const rowEntries = [...registry.rows.entries()];
      const gapEntries = [...registry.gaps.entries()];
      void Promise.all([
        measure(rowView),
        measure(container),
        Promise.all(rowEntries.map(([, rowRef]) => measure(rowRef))),
        Promise.all(gapEntries.map(([, gap]) => measure(gap.view))),
      ]).then(([row, containerRect, rowRects, gapRects]) => {
        if (session.current !== current) return;
        // The gesture reports window coordinates too, but on some Android
        // versions they are offset from measureInWindow's by the status bar.
        // The lifted row is in both, so it gives the correction.
        const dy = absoluteY - localY - row.y;
        rowEntries.forEach(([id], index) => {
          const rect = rowRects[index];
          if (rect !== undefined) current.rows.set(id, shift(rect, 0, dy));
        });
        current.gaps = gapEntries.flatMap(([key, gap], index) => {
          const rect = gapRects[index];
          return rect === undefined ? [] : [{ key, place: gap.place, rect: shift(rect, 0, dy) }];
        });
        // The container is the scroll view's frame, so it is also the
        // viewport the edge scroll measures against.
        current.container = shift(containerRect, 0, dy);
        current.ready = true;

        overlayY.set(current.y - current.grabY - current.container.y);
        setOverlay({ left: row.x - containerRect.x, width: row.width });
        hitTest();
        autoScroll(current);
      });
    },
    [registry, overlayY, hitTest, autoScroll],
  );

  const move = useCallback(
    (absoluteY: number): void => {
      const current = session.current;
      if (current === null) return;
      current.y = absoluteY;
      if (!current.ready) return;
      overlayY.set(absoluteY - current.grabY - current.container.y);
      autoScroll(current);
      hitTest();
    },
    [overlayY, autoScroll, hitTest],
  );

  const end = useCallback((canceled: boolean): void => {
    const current = session.current;
    if (current === null) return;
    session.current = null;
    stopDwell(current);
    if (current.frame !== null) cancelAnimationFrame(current.frame);
    setView(null);
    setOverlay(null);

    const target = current.target;
    if (canceled || !current.ready || target === null) return;
    if (target.kind === 'group') {
      // Hovering without the hold is passing over a row, not a drop onto it.
      if (!target.armed) return;
      handlers.current.onDropGroup(current.slotId, target.slotId);
    } else {
      handlers.current.onDropGap(current.slotId, target.place);
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // A drag cut short by leaving the screen must not leave a timer behind.
  useEffect(
    () => () => {
      const current = session.current;
      if (current === null) return;
      stopDwell(current);
      if (current.frame !== null) cancelAnimationFrame(current.frame);
    },
    [],
  );

  const value = useMemo<DragContextValue>(
    () => ({ view, registry, begin, move, end }),
    [view, registry, begin, move, end],
  );

  return (
    <DragContext.Provider value={value}>
      <View ref={containerRef} style={styles.root} collapsable={false}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEnabled={view === null}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
          }}
          onContentSizeChange={(_width, height) => {
            contentHeight.current = height;
          }}
        >
          {children}
        </ScrollView>
        {view === null || overlay === null ? null : (
          <Animated.View
            pointerEvents="none"
            style={[styles.overlay, { left: overlay.left, width: overlay.width }, overlayStyle]}
          >
            {renderDragged(view.slotId)}
          </Animated.View>
        )}
      </View>
    </DragContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
