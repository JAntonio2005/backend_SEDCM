#!/usr/bin/env sh

### File: stylelint_spec.sh
##
## stylelintによる*.cssファイルの検証。
##
## Usage:
##
## ------ Text ------
## shellspec css_spec.sh
## ------------------
##
## Metadata:
##
##   id - 1cb8f4cf-9e20-4e71-ac40-d94c1f4eedfb
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-06-02
##   modified - 2025-09-10
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-4.0.txt>
##   depends - stylelint
##   conforms-to - <https://github.com/shellspec/shellspec/blob/master/docs/references.md>
##
## See Also:
##
##   * <Project homepage at https://github.com/qq542vev/speckit>
##   * <Bag report at https://github.com/qq542vev/speckit/issues>

eval "$(shellspec -) exit 0"

for inc in "${SHELLSPEC_HELPERDIR}/speckit.sh" "${SHELLSPEC_HELPERDIR}/lib/speckit.sh" "${SHELLSPEC_SPECFILE%/*}/speckit.sh"; do
	[ -z "${SPECKIT_MODULE_LOADED+_}" ] || break

	if [ -f "${inc}" ]; then
		Include "${inc}"
	fi
done

Describe 'stylelint' speckit category:css
	if [ -z "${SPECKIT_STYLELINT_CMD+_}" ]; then
		Skip if 'not exists stylelint' speckit_not_exists_all stylelint
	fi

	stylelint_test() {
		# shellcheck disable=SC2016
		speckit_find_file '${SPECKIT_STYLELINT_CMD:-stylelint} ${SPECKIT_STYLELINT_ARGS-} -- "${@}"' '?*.css'
	}

	Example '*.css'
		When call stylelint_test
		The status should eq 0
	End
End
