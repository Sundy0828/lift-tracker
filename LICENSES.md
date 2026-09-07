# Third-party content

## Exercise catalog — free-exercise-db

`src/catalog/generated/` is derived from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db), released under
the **Unlicense** (public domain). Exercise images are referenced by URL and
are not redistributed here.

## Body diagram geometry — body-highlighter

The polygons in `src/components/MuscleMap/bodyPolygons.ts` are adapted from
[body-highlighter](https://github.com/lahaxearnaud/body-highlighter) v3.0.2.

```
MIT License

Copyright (c) 2020 GV79

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Adapted, not copied verbatim: coordinates are rounded to one decimal, the
inner-thigh region is renamed from `abductors` to `adductors` to match its
geometry, an outer-hip region is added, and the polygons are regrouped into
this app's muscle vocabulary.
