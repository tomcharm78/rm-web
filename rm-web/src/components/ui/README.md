# shadcn/ui Components

These are NOT included in this repo — they're installed by running:

```bash
npx shadcn@latest add button input label card form alert toast separator
```

After running that, the following files will exist:

- `button.tsx`
- `input.tsx`
- `label.tsx`
- `card.tsx`
- `form.tsx`
- `alert.tsx`
- `toast.tsx`
- `separator.tsx`

Our code imports from `@/components/ui/<name>` and depends on the shadcn API.
If shadcn changes their component APIs in the future, only these files need updating
(they're your code, not a dependency).
