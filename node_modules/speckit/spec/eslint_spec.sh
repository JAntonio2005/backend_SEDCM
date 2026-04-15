#!/usr/bin/env sh

### File: eslint_spec.sh
##
## eslintによる*.js, *.cjs, *.mjsファイルの検証。
##
## Usage:
##
## ------ Text ------
## shellspec eslint_spec.sh
## ------------------
##
## Metadata:
##
##   id - a07956df-375e-49b0-8cea-dc8cbc3f98d9
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-06-02
##   modified - 2025-09-10
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-3.0.txt>
##   depends - eslint
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

Describe 'eslint' speckit category:javascript
	if [ -z "${SPECKIT_ESLINT_CMD+_}" ]; then
		Skip if 'not exists eslint' speckit_not_exists_all eslint
	fi

	eslint_test() {
		# shellcheck disable=SC2016
		speckit_find_file '${SPECKIT_ESLINT_CMD:-eslint} ${SPECKIT_ESLINT_ARGS-} -- "${@}"' '?*.js' '?*.[cm]js'
	}

	Example '*.js *.cjs *.mjs'
		When call eslint_test
		The status should eq 0
	End
End
