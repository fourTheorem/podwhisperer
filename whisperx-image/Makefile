.PHONY: install install-dev lint format test test-cov clean

# Install production dependencies (for container)
install:
	pip install -e .

# Install dev dependencies for local development
install-dev:
	pip install -e ".[dev,ci]"

# Run ruff linter
lint:
	ruff check src/ tests/

# Run ruff formatter
format:
	ruff format src/ tests/

# Check formatting without making changes
format-check:
	ruff format --check src/ tests/

# Run all linting checks (for CI)
check: lint format-check

# Run tests
test:
	pytest

# Run tests with coverage report
test-cov:
	pytest --cov=src --cov-report=term-missing --cov-report=html

# Clean build artifacts
clean:
	rm -rf .pytest_cache
	rm -rf .coverage
	rm -rf htmlcov
	rm -rf .ruff_cache
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
