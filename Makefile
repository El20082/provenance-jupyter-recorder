.PHONY: vectors

# Regenerate golden conformance vectors from the Provenance monorepo.
vectors:
	cd $(PROVENANCE_REPO) && node --experimental-strip-types tools/export-conformance-vectors.ts \
	  --out $(CURDIR)/tests/conformance/fixtures
