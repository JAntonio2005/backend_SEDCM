#!/usr/bin/env sh

### File: desktop-file-validate_spec.sh
##
## desktop-file-validateによる*.desktopファイルの検証。
##
## Usage:
##
## ------ Text ------
## shellspec desktop-file-validate_spec.sh
## ------------------
##
## Metadata:
##
##   id - 74502681-fffb-4891-ae9e-e5c368d3797e
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-06-03
##   modified - 2025-09-09
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-3.0.txt>
##   depends - desktop-file-validate
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

Describe 'desktop-file-validate' speckit category:desktop
	if [ -z "${SPECKIT_DESKTOP_FILE_VALIDATE_CMD+_}" ]; then
		Skip if 'not exists desktop-file-validate' speckit_not_exists_all desktop-file-validate
	fi

	desktopfilevalidate_test() {
		# shellcheck disable=SC2016
		speckit_find_file '${SPECKIT_DESKTOP_FILE_VALIDATE_CMD:-desktop-file-validate} ${SPECKIT_DESKTOP_FILE_VALIDATE_ARGS-} -- "${@}"' '?*.desktop'
	}

	Example '*.desktop'
		When call desktopfilevalidate_test
		The status should eq 0
	End
End
