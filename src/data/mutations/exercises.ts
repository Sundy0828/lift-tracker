import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { Equipment } from '@/domain/exercises';
import { CUSTOM_ID_PREFIX } from '@/domain/exercises';
import type { MuscleGroup } from '@/domain/muscles';
import { paths } from '../paths';

export type CustomExerciseInput = {
  name: string;
  primaryMuscles: readonly MuscleGroup[];
  secondaryMuscles: readonly MuscleGroup[];
  equipment: Equipment | null;
};

/**
 * Ids are minted client-side so the write needs no round trip and works
 * offline. `custom_` keeps them from ever colliding with a catalog id.
 */
export function newCustomExerciseId(): string {
  return `${CUSTOM_ID_PREFIX}${crypto.randomUUID()}`;
}

export function saveCustomExercise(
  uid: string,
  id: string,
  input: CustomExerciseInput,
): Promise<void> {
  return setDoc(
    doc(paths.customExercises(uid), id),
    {
      name: input.name.trim(),
      primaryMuscles: [...input.primaryMuscles],
      secondaryMuscles: [...input.secondaryMuscles],
      equipment: input.equipment,
      isCustom: true,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function deleteCustomExercise(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(paths.customExercises(uid), id));
}
