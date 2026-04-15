#!/usr/bin/env sh

### File: shellcheck_spec.sh
##
## shellcheckによる*.shファイルの検証。
##
## Usage:
##
## ------ Text ------
## shellspec shellcheck_spec.sh
## ------------------
##
## Metadata:
##
##   id - 854d83d4-1a36-43c1-acb8-cb52ca0bf421
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-06-03
##   modified - 2025-09-10
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-3.0.txt>
##   depends - shellcheck
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

Describe 'shellcheck' speckit category:shellscript
	if [ -z "${SPECKIT_SHELLCHECK_CMD+_}" ]; then
		Skip if 'not exists shellcheck' speckit_not_exists_all shellcheck
	fi

	shellcheck_test() {
		# shellcheck disable=SC2016
		speckit_find_file '${SPECKIT_SHELLCHECK_CMD:-shellcheck} -f gcc -s sh ${SPECKIT_SHELLCHECK_ARGS-} -- "${@}"' '?*.sh'
	}

	Example '-f gcc -s sh *.sh'
		When call shellcheck_test
		The status should eq 0
	End
End
