.PHONY: build test test-ci coverage deploy-amoy clean

build:
	forge build

test:
	forge test -vvv

test-ci:
	forge test --fuzz-runs 10000 --invariant-runs 1024 -vvv

coverage:
	forge coverage --report lcov

deploy-amoy:
	bash scripts/deploy-amoy.sh

clean:
	forge clean
