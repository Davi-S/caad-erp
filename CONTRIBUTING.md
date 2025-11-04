# Contributing to CAAD ERP

Thank you for your interest in improving CAAD ERP! We're thrilled to have you here. We appreciate your help in building a reliable system for the student lounge community.

This document lays out the expectations for contributors so that changes remain predictable, maintainable, and easy to review.

## Quick Links

- **Developer Guide:** `docs/DEVELOPER_GUIDE.md`
- **Issue Tracker:** [issue tracker](https://github.com/Davi-S/caad-erp/issues)
- **Main README:** `README.md`

## Table of Contents

- [Contributing to CAAD ERP](#contributing-to-caad-erp)
  - [Quick Links](#quick-links)
  - [Table of Contents](#table-of-contents)
  - [How to Contribute](#how-to-contribute)
    - [Reporting Bugs](#reporting-bugs)
    - [Suggesting Enhancements](#suggesting-enhancements)
    - [Submitting Pull Requests](#submitting-pull-requests)
      - [Pull Request Checklist](#pull-request-checklist)
  - [Development Setup](#development-setup)
    - [Local Environment Setup](#local-environment-setup)
  - [Style Guides](#style-guides)

## How to Contribute

Before picking up an issue or proposing a change, take time to read `docs/DEVELOPER_GUIDE.md` so you understand the project architecture, workflows, and coding conventions. A quick refresh on the guide prevents rework, keeps discussions focused, and helps reviewers follow your intent.

### Reporting Bugs

If you find a bug, please ensure it hasn't already been reported by searching the [<https://github.com/Davi-S/caad-erp/issues>).

When submitting a bug report, please include:

- A clear, descriptive title.
- Your OS and software versions.
- Steps to reproduce the bug.
- What you expected to happen.
- What actually happened.

### Suggesting Enhancements

If you have an idea for a new feature, please check the [issue tracker](https://github.com/Davi-S/caad-erp/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement) to see if it has been suggested. If not, open a new issue with:

- A clear, descriptive title.
- A detailed description of the proposed feature.
- The problem it solves or the value it adds.

### Submitting Pull Requests

1. **Fork** the repository.
2. **Clone** your fork: `git clone https://github.com/YOUR-USERNAME/your-repo.git`
3. **Create a branch:** `git checkout -b feat/your-new-feature-name`
4. **Make your changes.**
5. **Run the tests**.
6. **Commit** your changes with a clear message.
7. **Push** your branch: `git push origin feat/your-new-feature-name`
8. **Open a Pull Request** from your fork to the `main` branch of this repository.
9. **Link** any relevant issues in your PR description.

#### Pull Request Checklist

- [ ] New or updated tests cover the change.
- [ ] All tests pass locally.
- [ ] Documentation updates (if needed) are included.
- [ ] Branch is up-to-date with `main`.
- [ ] PR description explains the motivation, approach, and testing performed.

## Development Setup

### Local Environment Setup

Install [`uv`](https://docs.astral.sh/uv/) for environment and dependency management.

```bash
git clone https://github.com/your-org/caad_erp.git
cd caad_erp
uv venv
source .venv/bin/activate
uv pip install -e ".[test]"
uv run pytest
```

## Style Guides

- **Git Commits:** Please follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- **Docstrings:** Use Google-style docstrings for public functions. Use Given-When-Then pattern for tests docstrings.
