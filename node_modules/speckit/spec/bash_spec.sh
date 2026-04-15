#!/usr/bin/env bash

### File: bash_spec.sh
##
## bashによる*.shファイルの検証。
##
## Usage:
##
## ------ Text ------
## bashellspec bash_spec.bash
## ------------------
##
## Metadata:
##
##   id - c87ddc38-29e3-4964-b1b1-4416c05aac08
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-06-03
##   modified - 2025-09-09
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-3.0.txt>
##   depends - bash
##   conforms-to - <https://github.com/bashellspec/bashellspec/blob/master/docs/references.md>
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

Describe 'bash' speckit category:shellscript
	if [ -z "${SPECKIT_BASH_CMD+_}" ]; then
		Skip if 'not exists bash' speckit_not_exists_all bash
	fi

	bash_test() {
		# shellcheck disable=SC2016
		speckit_find_file '
			for file in "${@}"; do
				${SPECKIT_BASH_CMD:-bash} -n ${SPECKIT_BASH_ARGS-} -- "${file}" || exit="${exit-${?}}"
			done

			exit "${exit-0}"
		' '?*.sh'
	}

	Example '-n *.sh'
		When call bash_test
		The status should eq 0
	End
End
