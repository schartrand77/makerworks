# Contributing to MakerWorks

Thank you for your interest in improving MakerWorks! This project uses a mono-repo that powers the backend, frontend and mobile clients. This guide explains how to get your changes merged.

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) to help us maintain a welcoming community.

## Branching
- Use short-lived feature branches cut from the stable `main` branch.
- Prefer descriptive branch names such as `feat/summary-page` or `fix/login-bug`.
- Open a pull request early and keep the branch focused on a single topic.

## Coding Style
- Follow the existing style of the code you are touching.
- Run the pre-commit script before committing: `./pre-commit`. It lints the frontend and bumps the version number.
- For development setup and available `make` commands, see [DEV.md](DEV.md).

## Tests
- Backend: `cd makerworks-backend && pytest`
- Frontend: `cd makerworks-frontend && npm test`
- Ensure all tests pass locally before pushing your branch.

## Commit Conventions
- Commit messages use the [Conventional Commits](https://www.conventionalcommits.org/) specification (e.g., `feat:`, `fix:`, `docs:`).
- Keep commits small and focused; avoid mixing unrelated changes.

We appreciate your contributions—thank you for helping MakerWorks grow!
