PROJECT_NAME = krohnkite-flowrange
KWINPKG_FILE = builds/$(PROJECT_NAME).kwinscript

all: package

deps:
	npm ci --ignore-scripts

package:
	npm run package

test:
	npm test

test-kwin:
	npm run test:kwin

install: package
	@if kpackagetool6 -t KWin/Script -s $(PROJECT_NAME) >/dev/null 2>&1; then \
		kpackagetool6 -t KWin/Script -u $(KWINPKG_FILE); \
	else \
		kpackagetool6 -t KWin/Script -i $(KWINPKG_FILE); \
	fi

uninstall:
	kpackagetool6 -t KWin/Script -r $(PROJECT_NAME)

clean:
	rm -rf pkg krohnkite.js $(KWINPKG_FILE)

.PHONY: all deps package test test-kwin install uninstall clean
