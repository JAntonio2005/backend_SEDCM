#!/usr/bin/env sh

### File: jq_spec.sh
##
## jqによる*.jsonファイルの検証。
##
## Usage:
##
## ------ Text ------
## shellspec jq_spec.sh
## ------------------
##
## Metadata:
##
##   id - 471b67fe2c490a129bc8a6de4f5ea614df66752a
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-09-15
##   modified - 2025-09-15
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-3.0.txt>
##   depends - jq
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

Describe 'jq' speckit category:json
	if [ -z "${SPECKIT_JQ_CMD+_}" ]; then
		Skip if 'not exists jq' speckit_not_exists_all jq
	fi

	jq_test() {
		# shellcheck disable=SC2016
		speckit_find_file '
			for file in "${@}"; do
				out=$(${SPECKIT_JQ_CMD:-jq} ${SPECKIT_JQ_ARGS-} empty -- "${file}" 2>&1) || exit="${exit-${?}}"

				[ -n "${out}" ] && printf "%s: %s\\n" "${file}" "${out}" >&2
			done

			exit "${exit-0}"
		' '?*.json'
	}

	Example 'empty *.json'
		When call jq_test
		The status should eq 0
	End
End
