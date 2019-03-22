module.exports = function dockerListToMap(rawList) {
	return rawList.reduce((acc, item) => {
		acc[item.ID] = item.Spec
		return acc
	}, {})
}
