# Contributing
Thanks for your interest in contributing to `@guardbot/chalk`! Whether you're fixing a bug, improving the documentation, or suggesting a new feature, your contributions are welcome.

If you have a question or need help getting started, feel free to ask in our [support server](https://discord.gg/invite/GaczkwfgV9). For bug reports and feature requests, please open an [issue on GitHub](https://github.com/guardbotgg/chalk/issues).


## Getting Started
You need Node.js 22.12+ and Yarn 1.
```bash
git clone https://github.com/guardbotgg/chalk.git
cd chalk
yarn install
```

### Available Scripts
| Command              | Description                                                                            |
| -------------------- | -------------------------------------------------------------------------------------- |
| `yarn build`         | Builds the source into `build/`, including ESM, CommonJS, and TypeScript declarations. |
| `yarn typecheck`     | Checks types across `src/` and `tests/`, including type tests.                         |
| `yarn lint`          | Runs ESLint to check code quality and consistency.                                     |
| `yarn test`          | Builds the project and runs the unit tests.                                            |
| `yarn check:package` | Verifies that the package works correctly with both ESM and CommonJS imports.          |
| `yarn dev`           | Runs a demo showcasing the logger's features directly from `src/`.                     |
| `yarn bench`         | Benchmarks the logger against Pino.                                                    |

Before opening a pull request, it's a good idea to run the type checker, linter, and tests locally so you can catch any issues early.


### Discord Webhook (Optional)
You can also test Discord webhook logging while running the demo. Create a `.env` file in the project root and add your webhook URL:
```env
WEBHOOK_URL=https://discord.com/api/webhooks/...
```


## Project Structure
```bash
src/
├── core/        # Logger, shared core, scopes, entries, levels, and errors
├── formatters/  # Pretty and JSON formatters
├── transports/  # Console, file, and Discord webhook transports
├── utils/       # Colors, serialization, timestamps, buffering, and exit handling
└── types.ts     # Public types, including the Transport interface

tests/
├── unit/        # Unit tests using node:test, run against the build
├── types/       # Type tests checked by yarn typecheck
└── index.ts     # Demo entry point used by yarn dev

bench/           # Benchmark scripts used by yarn bench
```


## Guidelines
- **No logging errors:** Validate options at initialization. Use `ChalkError` for configuration errors and `process.emitWarning()` for runtime issues. Avoid `console` in `src/`.
- **Don't lose logs:** Flush buffered output through `flushSync()`, including on `fatal()` and process exit.
- **Keep it fast:** Cache reusable scope data and benchmark changes that affect performance with `yarn bench`.
- **Test your changes:** Add tests for bug fixes and new behavior. Use the existing test helpers where possible.
- **Update docs:** Keep `README.md` and `CHANGELOG.md` up to date. Include migration notes for breaking changes.


## Pull Requests
- Branch off `master` and keep each PR focused on one change.
- Add tests and update documentation where needed.
- Run the checks before pushing:
  ```bash
  yarn typecheck && yarn lint && yarn test
  ```
- Fill in the PR template and clearly explain what changed and why.
