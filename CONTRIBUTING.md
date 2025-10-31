# Contributing to CAAD ERP

Thank you for your interest in improving CAAD ERP! This document lays out the
expectations for contributors so that changes remain predictable, maintainable,
and easy to review.

## Prerequisites

- Familiarity with the architectural overview in `docs/DEVELOPER_GUIDE.md`.

## Local Environment Setup

```bash
git clone https://github.com/your-org/caad_erp.git
cd caad_erp
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

Adjust `config.ini` if you need to point at a local data file.

## Workflow Expectations

1. **Discuss larger changes first.** Open an issue or join an existing
   conversation before starting significant work.
2. **Create a feature branch** off the latest `main`. Use descriptive branch
   names such as `feature/cli-shell` or `fix/void-validation`.
3. **Commit early and often** with clear messages. Prefer the imperative mood
   (e.g., `Add stock reconciliation helper`).
4. **Keep pull requests focused.** Each PR should solve one problem and include
   only related changes, tests, and docs.
5. **Stay synced.** Rebase or merge `main` frequently to reduce conflicts and
   ensure compatibility with the current code base.

## Coding Standards

- Follow the three-layer architecture (DAL, BLL, Presentation). Respect module
  boundaries spelled out in `docs/DEVELOPER_GUIDE.md`.
- Embrace test-driven development. Add or update tests in `tests/` to describe
  the behavior you expect before implementing it.
- Use Google-style docstrings for public functions. Keep inline comments brief
  and only where logic needs clarification.
- Default to readable, explicit Python that favors maintainability over clever
  one-liners.
- Do not introduce new runtime dependencies without prior discussion.

## Running Tests Locally

Before submitting a pull request:

1. Activate your virtual environment and confirm dependencies are installed:

   ```bash
   pip install -e .
   ```

2. Execute the test suite:

   ```bash
   pytest
   ```

3. Verify documentation snippets or examples still execute as written.

## Documentation and Changelog

- Update `README.md` when user-facing behavior or setup steps change.
- Extend `docs/DEVELOPER_GUIDE.md` if architectural decisions or workflows are
  adjusted.
- Note breaking changes or significant additions in the pull request body.

## Pull Request Checklist

- [ ] New or updated tests cover the change.
- [ ] All tests pass locally.
- [ ] Documentation updates (if needed) are included.
- [ ] Branch is up-to-date with `main`.
- [ ] PR description explains the motivation, approach, and testing performed.

## Outro

By following this guide we keep CAAD ERP approachable for future contributors
and maintainers. We appreciate your help in building a reliable system for the
student lounge community!
