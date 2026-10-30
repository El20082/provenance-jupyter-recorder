.PHONY: vectors

# Regenerate golden conformance vectors from the Provenance monorepo.
# path-scope-vectors.json is a verbatim copy; the exporter does not produce it.
vectors:
	cd $(PROVENANCE_REPO) && node --experimental-strip-types tools/export-conformance-vectors.ts \
	  --out $(CURDIR)/tests/conformance/fixtures \
	  --recorder-out $(CURDIR)/tests/conformance/fixtures
	cp $(PROVENANCE_REPO)/tools/path-scope-vectors.json $(CURDIR)/tests/conformance/fixtures/
