async function dummySearch(queryParams) {
  // 这里下一步替换成 seats/pointsyah/航司 adapter
  return [
    {
      summary: "Dummy itinerary",
      pointsCost: 75000,
      taxes: 56,
      program: "ExampleProgram",
      segments: [
        { from: queryParams.from, to: queryParams.to, dep: queryParams.date, arr: queryParams.date, carrier: "XX", flightNo: "123" },
      ],
      source: "dummy",
    },
  ];
}

module.exports = { dummySearch };