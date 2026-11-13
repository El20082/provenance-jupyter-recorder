.PHONY: install build test typecheck lint format vectors

# Install JavaScript dependencies and build the vendored log-core.
install:
	npm install

# Build the frontend and the prebuilt labextension. Needs JupyterLab on PATH.
build:
	npm run build

test:
	npm test

typecheck:
	npm run typecheck

lint:
	npm run lint

format:
	npm run format

# Regenerate golden conformance vectors from the Provenance monorepo.
# path-scope-vectors.json is a verbatim copy; the exporter does not produce it.
vectors:
	cd $(PROVENANCE_REPO) && node --experimental-strip-types tools/export-conformance-vectors.ts \
	  --out $(CURDIR)/tests/conformance/fixtures \
	  --recorder-out $(CURDIR)/tests/conformance/fixtures
	cp $(PROVENANCE_REPO)/tools/path-scope-vectors.json $(CURDIR)/tests/conformance/fixtures/
