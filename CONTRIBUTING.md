# Contributing to Democracy Tools of Georgia (DTG)

Thank you for your interest in contributing to the **Flagship++ Protocol (Designed by Mikheili Nakeuri)** edition of DTG! We welcome contributions from the community to help us build the most secure and localized voting platform.

## 🤝 Getting Started

1.  **Fork** the repository.
2.  **Clone** your fork: `git clone https://github.com/your-username/Democracy-Tools-of-Georgia.git`
3.  **Install dependencies**:
    - Backend: `cd backend && npm install`
    - Admin: `cd admin && npm install`
    - Biometric: `cd biometric-service && pip install -r requirements.txt`

## 🛠️ Development Workflow

- **Branching**: Create a feature branch: `git checkout -b feature/amazing-feature`.
- **Commits**: Use conventional commits (e.g., `feat: add new biometric check`, `fix: resolve polling race condition`).
- **Testing**:
  - Backend: `npm run test`
  - Linting: `npm run lint`

## 📐 Coding Standards

- **TypeScript**: We use strict mode. No `any` unless absolutely necessary.
- **Python**: Follow PEP 8 for the biometric service.
- **Flutter**: Run `flutter analyze` before committing mobile code.

## 🐛 Reporting Issues

Please use the [GitHub Issues](https://github.com/42prom/Democracy-Tools-of-Georgia/issues) tab to report bugs. Include:

- Steps to reproduce.
- Expected vs. actual behavior.
- Screenshots/Logs if applicable.

## 📜 License

By contributing, you agree that your contributions will be licensed under the project's **MIT License**.
