#!/usr/bin/env sh

### File: gmake_spec.sh
##
## gmakeによるmakeファイルの検証。
##
## Usage:
##
## ------ Text ------
## shellspec gmake_spec.sh
## ------------------
##
## Metadata:
##
##   id - 284dfed6-135a-4b74-a3df-3b49ef5153d3
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-09-17
##   modified - 2025-09-17
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-3.0.txt>
##   depends - gmake
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

Describe 'gmake' speckit category:makefile
	if [ -z "${SPECKIT_GMAKE_CMD+_}" ]; then
		Skip if 'not exists gmake' speckit_not_exists_all gmake
	fi

	gmake_test() {
		# shellcheck disable=SC2016
		speckit_find_file '
			for file in "${@}"; do
				${SPECKIT_GMAKE_CMD:-gmake} -n ${SPECKIT_GMAKE_ARGS-} -f "${file}" >/dev/null || exit="${exit-${?}}"
			done

			exit "${exit-0}"
		' 'makefile' '?*.mk'
	}

	Example '-n -f makefile'
		When call gmake_test
		The status should eq 0
	End
End
