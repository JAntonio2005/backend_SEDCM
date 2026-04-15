#!/usr/bin/env sh

### File: markuplint_spec.sh
##
## markuplintによる*.html, *.xhtmlの検証。
##
## Usage:
##
## ------ Text ------
## shellspec markuplint_spec.sh
## ------------------
##
## Metadata:
##
##   id - e01e7a20-0c6f-44fc-a602-63f5067430d5 
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-09-14
##   modified - 2025-09-14
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-3.0.txt>
##   depends - markuplint
##   conforms-to - <https://github.com/shellspec/shellspec/blob/master/docs/references.md>
##
## See Also:
##
##   * <Project homepage at https://github.com/qq542vev/speckit>
##   * <Bag report at https://github.com/qq542vev/speckit/issues>

eval "$(shellspec -) exit 1"

for inc in "${SHELLSPEC_HELPERDIR}/speckit.sh" "${SHELLSPEC_HELPERDIR}/lib/speckit.sh" "${SHELLSPEC_SPECFILE%/*}/speckit.sh"; do
	[ -z "${SPECKIT_MODULE_LOADED+_}" ] || break

	if [ -f "${inc}" ]; then
		Include "${inc}"
	fi
done

Describe 'markuplint' speckit category:html
	if [ -z "${SPECKIT_MARKUPLINLT_CMD+_}" ]; then
		Skip if 'not exists markuplint' speckit_not_exists_all markuplint
	fi

	markuplint_test() {
		# shellcheck disable=SC2016
		speckit_find_file '${SPECKIT_MARKUPLINLT_CMD:-markuplint} ${SPECKIT_MARKUPLINLT_ARGS-} -- "${@}"' '?*.html' '?*.xhtml'
	}

	Example "*.html *.xhtml"
		When call markuplint_test
		The status should eq 0
	End
End
