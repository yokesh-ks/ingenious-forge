#!/bin/sh
# One-time setup after cloning: enable the shared git hooks in .githooks/.
set -e
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
echo "Git hooks enabled: core.hooksPath = $(git config core.hooksPath)"
