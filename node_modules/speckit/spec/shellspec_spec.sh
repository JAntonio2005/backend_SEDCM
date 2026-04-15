#!/usr/bin/env sh

### File: spec_spec.sh
##
## shellspecによる*_spec.shの検証。
##
## Usage:
##
## ------ Text ------
## shellspec shellspec_spec.sh
## ------------------
##
## Metadata:
##
##   id - dc64e0cc-a435-4391-86d9-417a72926e90
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-06-03
##   modified - 2025-09-11
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-3.0.txt>
##   depends - shellspec
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

Describe 'shellspec' speckit category:shellspec
	if [ -z "${SPECKIT_SHELLSPEC_CMD+_}" ]; then
		Skip if 'not exists shellspec' speckit_not_exists_all shellspec
	fi

	shellspec_test() {
		# shellcheck disable=SC2016
		speckit_find_file '${SPECKIT_SHELLSPEC_CMD:-shellspec} --syntax-check ${SPECKIT_SHELLSPEC_ARGS-} -- "${@}" >/dev/null' '?*_spec.sh'
	}

	Example '--syntax-check *_spec.sh'
		When call shellspec_test
		The status should eq 0
	End
End
