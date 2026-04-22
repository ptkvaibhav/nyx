## Summary

- explain the problem addressed
- explain the user-facing behavior change

## Checklist

- [ ] scan scope remains limited to approved directories
- [ ] no rename, move, or delete occurs without an approval path
- [ ] duplicate or irrelevance logic includes evidence
- [ ] tests or verification commands were run
- [ ] docs were updated if the workflow changed

## Verification

```bash
npm run check:quality
npm run check:security
npm test
npm run test:smoke
```

## Risks

- list edge cases, residual risks, or missing follow-up work
