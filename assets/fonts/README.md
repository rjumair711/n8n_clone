# Fonts for the PDF Generator

These files are read at runtime by `src/features/executions/lib/pdf.ts` when a
PDF contains text the built-in PDF fonts cannot draw.

| File | Covers |
| ---- | ------ |
| `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` | Latin, Cyrillic, Greek, Vietnamese |
| `NotoNaskhArabic-Regular.ttf`, `NotoNaskhArabic-Bold.ttf` | Arabic, Urdu, Persian, Pashto, Sindhi |

They are the Noto fonts from https://github.com/notofonts, licensed under the
SIL Open Font License 1.1 (https://openfontlicense.org), which allows bundling
and redistribution.
