#!/usr/bin/env dash

### File: dash_spec.sh
##
## dashによる*.shファイルの検証。
##
## Usage:
##
## ------ Text ------
## dashellspec dash_spec.dash
## ------------------
##
## Metadata:
##
##   id - 1466a5bb-7c87-4174-88ed-8a44c43335a1
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-09-17
##   modified - 2025-09-17
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-3.0.txt>
##   depends - dash
##   conforms-to - <https://github.com/dashellspec/dashellspec/blob/master/docs/references.md>
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

Describe 'dash' speckit category:shellscript
	if [ -z "${SPECKIT_DASH_CMD+_}" ]; then
		Skip if 'not exists dash' speckit_not_exists_all dash
	fi

	dash_test() {
		# shellcheck disable=SC2016
		speckit_find_file '
			for file in "${@}"; do
				${SPECKIT_DASH_CMD:-dash} -n ${SPECKIT_DASH_ARGS-} -- "${file}" || exit="${exit-${?}}"
			done

			exit "${exit-0}"
		' '?*.sh'
	}

	Example '-n *.sh'
		When call dash_test
		The status should eq 0
	End
End
