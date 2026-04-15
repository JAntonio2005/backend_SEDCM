#!/usr/bin/env sh

### File: tidy_spec.sh
##
## tidyによる*.html, *.xhtmlの検証。
##
## Usage:
##
## ------ Text ------
## shellspec tidy_spec.sh
## ------------------
##
## Metadata:
##
##   id - 6a58f8b0-02fe-4dd0-87c7-7d7ca64a85af
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-06-02
##   modified - 2025-09-09
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-3.0.txt>
##   depends - tidy
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

Describe 'tidy' speckit category:html
	if [ -z "${SPECKIT_TIDY_CMD+_}" ]; then
		Skip if 'not exists tidy' speckit_not_exists_all tidy
	fi

	tidy_test() {
		# shellcheck disable=SC2016
		speckit_find_file '${SPECKIT_TIDY_CMD:-tidy} -eq --show-filename yes ${SPECKIT_TIDY_ARGS-} -- "${@}"' '?*.html' '?*.xhtml'
	}

	Example "-eq --show-filename yes-- *.html *.xhtml"
		When call tidy_test
		The status should not eq 2
	End
End
