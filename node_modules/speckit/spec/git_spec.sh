#!/usr/bin/env sh

### File: git_spec.sh
##
## gitによる.gitディレクトリの検証。
##
## Usage:
##
## ------ Text ------
## shellspec git_spec.sh
## ------------------
##
## Metadata:
##
##   id - fadc04a2-13e3-43cc-9546-510d304440f1
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-06-03
##   modified - 2025-09-11
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-3.0.txt>
##   depends - git
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

Describe 'git' speckit category:git
	if [ -z "${SPECKIT_GIT_CMD+_}" ]; then
		Skip if 'not exists git' speckit_not_exists_all git
	fi

	git_test() {
		# shellcheck disable=SC2016
		speckit_find_dir '
			for dir in "${@}"; do
				out=$(GIT_DIR="${dir}" ${SPECKIT_GIT_CMD:-git} ${SPECKIT_GIT_ARGS-} '"${*}"' 2>&1) || exit="${exit-${?}}"

				[ -n "${out}" ] && printf "=== %s ===\\n%s\\n" "${dir}" "${out}" >&2
			done

			exit "${exit-0}"
		' '.git'
	}
    
	Example 'diff --cached --check'
		When call git_test diff --cached --check
		The status should eq 0
	End

	Example 'commit-graph verify'
		When call git_test commit-graph verify
		The status should eq 0
	End

	Example 'fsck --full --strict'
		When call git_test fsck --full --strict --no-progress
		The status should eq 0
	End
End
