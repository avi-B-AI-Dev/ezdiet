# Instructions for Claude Code

## Git commits

- Do NOT add "Co-Authored-By: Claude" or any AI attribution to commit messages
- Do NOT add "🤖 Generated with Claude Code" footers
- Use conventional commit format: `type(scope): description`
  - Examples: `feat(pantry): add clear pantry action`, `fix(water): round glasses to whole numbers`, `docs: update README`
- Keep commit subject lines under 72 characters
- For large changes, include a body explaining the *why*, not the *what*

## Code

- This is a React Native + Expo project using SQLite
- Mock API mode is the default for dev (USE_MOCK_API=true)
- Prefer functional components and hooks over class components
- Prefer explicit imports over default re-exports
