#!/usr/bin/env sh

### File: speckit.sh
##
## 関数セットのファイル。
##
## Usage:
##
## ------ Text ------
## Include speckit.sh
## ------------------
##
## Metadata:
##
##   id - 28e2faed-9430-43e2-a266-5f0a1a473463
##   author - <qq542vev at https://purl.org/meta/me/>
##   version - 1.0.0
##   created - 2025-09-12
##   modified - 2025-09-14
##   copyright - Copyright (C) 2025-2025 qq542vev. All rights reserved.
##   license - <GPL-3.0-only at https://www.gnu.org/licenses/gpl-3.0.txt>
##
## See Also:
##
##   * <Project homepage at https://github.com/qq542vev/speckit>
##   * <Bag report at https://github.com/qq542vev/speckit/issues>

if [ -n "${SPECKIT_MODULE_LOADED+_}" ]; then
	# shellcheck disable=SC2034
	readonly SPECKIT_MODULE_LOADED=1
fi

speckit_find() (
	# shellcheck disable=SC2016
	code='IFS=${SPECKIT_IFS-${IFS}};'"${1}"
	shift
	set -f
	IFS="${SPECKIT_IFS-${IFS}}"

	# shellcheck disable=SC2086
	${SPECKIT_FIND_CMD:-find} . ${SPECKIT_FIND_ARGS-} "${@}" -exec sh -fc "${code}" sh '{}' +
)

speckit_find_file() {
	speckit_find_file__code="${1}"
	shift

	eval "set -- $(speckit_find_name "${@}")"

	speckit_find "${speckit_find_file__code}" "${@}" -type f
}

speckit_find_dir() {
	speckit_find_dir__code="${1}"
	shift

	eval "set -- $(speckit_find_name "${@}")"

	speckit_find "${speckit_find_dir__code}" "${@}" -type d
}

speckit_find_name() {
	if [ "${#}" -ne 0 ]; then
		printf "'(' -name '%s'" "${1}"
		shift

		if [ "${#}" -ne 0 ]; then
			printf " -o -name '%s'" "${@}"
		fi

		printf " ')'"
	fi
}

speckit_exists_cmd() {
	set -- "$(sh -c 'command -v "${1}"; printf _' sh "${1}")"
	set -- "${1%?_}"

	if ! [ -f "${1}" ] || ! [ -x "${1}" ]; then
		return 1
	fi
}

speckit_not_exists_all() {
	while [ "${#}" -ne 0 ]; do
		! speckit_exists_cmd "${1}" || return 1
		shift
	done
}

speckit_not_exists_any() {
	while [ "${#}" -ne 0 ]; do
		speckit_exists_cmd "${1}" || return 0
		shift
	done

	return 1
}
