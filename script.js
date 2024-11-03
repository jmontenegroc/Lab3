
const width = document.body.clientWidth;
const height = 600;
const lineChartHeight = 300;

const svgContainer = d3.select("#svgContainer");
const lineChartContainer = d3.select("#lineChart");

const atributos = [
  "Cobertura bruta en educación - Total",
  "Cobertura bruta en educación básica",
  "Cobertura bruta en educación media",
  "Cobertura bruta en educación primaria",
  "Cobertura bruta en educación secundaria",
  "Cobertura bruta en transición",
  "Cobertura en educación superior",
  "Cobertura neta en educación - Total",
  "Cobertura neta en educación básica",
  "Cobertura neta en educación media",
  "Cobertura neta en educación primaria",
  "Cobertura neta en educación secundaria",
  "Cobertura neta en transición"
];

const lineChartAttributes = [
  "Puntaje promedio Pruebas Saber 11 - Lectura crítica",
  "Puntaje promedio Pruebas Saber 11 - Matemáticas"
];

const selectMenu = d3.select("#atributoSelect")
  .on("change", updateMap);

selectMenu.selectAll("option")
  .data(atributos)
  .enter().append("option")
  .text(d => d)
  .attr("value", d => d);

function loadData(geojsonPath, csvPath) {
  return Promise.all([
    d3.json(geojsonPath),
    d3.csv(csvPath)
  ]).then(([geojson, csvData]) => {
    const dataMap = new Map();

    atributos.forEach(indicador => {
      const coberturaData = csvData.filter(d => d.Indicador === indicador);
      coberturaData.forEach(d => {
        const codigo = String(d["Código Departamento"]).padStart(2, "0");
        if (!dataMap.has(codigo)) {
          dataMap.set(codigo, {});
        }
        dataMap.get(codigo)[indicador] = parseFloat(d["Dato Numérico"].replace(",", ".")) || 0;
      });
    });

    geojson.features.forEach(feature => {
      const data = dataMap.get(feature.properties.DPTO_CCDGO);
      if (data) {
        atributos.forEach(attr => {
          feature.properties[attr] = data[attr] || 0;
        });
      } else {
        atributos.forEach(attr => {
          feature.properties[attr] = 0;
        });
      }
    });

    return { geojson, csvData };
  });
}

function createProjection(geojsonData) {
  return d3.geoMercator()
    .fitSize([width, height], geojsonData);
}

const path = d3.geoPath();

function createColorScale(data, selectedAttribute) {
  const values = data.features.map(d => d.properties[selectedAttribute]);
  const mean = d3.mean(values);
  return d3.scaleSequential()
    .domain([0, mean])
    .interpolator(d3.interpolateHsl("hsl(210, 100%, 90%)", "hsl(210, 100%, 50%)"));
}

function drawMap(geojsonData, selectedAttribute) {
  const svg = svgContainer;
  const projection = createProjection(geojsonData);
  path.projection(projection);
  const colorScale = createColorScale(geojsonData, selectedAttribute);
  const tooltip = d3.select("#tooltip");

  const paths = svg.selectAll("path")
    .data(geojsonData.features, d => d.properties.DPTO_CCDGO);

  paths.enter().append("path")
    .attr("d", path)
    .attr("fill", d => colorScale(d.properties[selectedAttribute]))
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5)
    .on("mouseover", function(event, d) {
      tooltip.transition().duration(200).style("opacity", .9);
      tooltip.html(`<strong>${d.properties.DPTO_CNMBR}</strong><br>${selectedAttribute}: ${d.properties[selectedAttribute]}`)
        .style("left", (event.pageX + 5) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function() {
      tooltip.transition().duration(500).style("opacity", 0);
    })
    .on("click", function(event, d) {
      updateLineChart(d.properties.DPTO_CCDGO);
      svg.selectAll("path")
        .style("opacity", 0.3);
      d3.select(this)
        .style("opacity", 1);
      event.stopPropagation();
    });

  paths.attr("d", path)
    .attr("fill", d => colorScale(d.properties[selectedAttribute]));

  paths.exit().remove();

  d3.select("body").on("click", function(event) {
    if (!event.target.closest("svg")) {
      svg.selectAll("path")
        .style("opacity", 1);
    }
  });

  svg.on("click", function() {
    svg.selectAll("path")
      .style("opacity", 1);
  });
}

function updateMap() {
  const selectedAttribute = d3.select("#atributoSelect").property("value");
  drawMap(geojsonData.geojson, selectedAttribute);
}

function drawLineChart(csvData, departamento = null) {
  const margin = { top: 20, right: 30, bottom: 30, left: 40 };
  const width = document.body.clientWidth - margin.left - margin.right;
  const height = lineChartHeight - margin.top - margin.bottom;

  const svg = lineChartContainer
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleTime().range([0, width]);
  const y = d3.scaleLinear().range([height, 0]);

  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.value));

  const data = lineChartAttributes.map(attr => {
    const filteredData = csvData.filter(d => d.Indicador === attr && (!departamento || d["Código Departamento"] === departamento));
    const nestedData = d3.group(filteredData, d => d.Año);
    const averagedData = Array.from(nestedData, ([year, values]) => ({
      year: new Date(year, 0, 1),
      value: d3.mean(values, d => parseFloat(d["Dato Numérico"].replace(",", ".")))
    }));
    return {
      name: attr,
      values: averagedData
    };
  });

  x.domain(d3.extent(data[0].values, d => d.year));
  y.domain([
    d3.min(data, c => d3.min(c.values, d => d.value)),
    d3.max(data, c => d3.max(c.values, d => d.value))
  ]);

  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)));

  svg.append("g")
    .call(d3.axisLeft(y));

  const lines = svg.selectAll(".line")
    .data(data, d => d.name);

  const linesEnter = lines.enter().append("g")
    .attr("class", "line");

  linesEnter.append("path")
    .attr("class", "line")
    .attr("d", d => line(d.values))
    .style("stroke", (d, i) => d3.schemeCategory10[i])
    .style("fill", "none");

  linesEnter.merge(lines).select("path")
    .attr("d", d => line(d.values))
    .style("stroke", (d, i) => d3.schemeCategory10[i]);

  lines.exit().remove();

  const tooltip = d3.select("#tooltip");

  const circles = linesEnter.merge(lines).selectAll("circle")
    .data(d => d.values);

  circles.enter().append("circle")
    .attr("cx", d => x(d.year))
    .attr("cy", d => y(d.value))
    .attr("r", 3)
    .style("fill", (d, i, nodes) => d3.select(nodes[i].parentNode).select("path").style("stroke"))
    .on("mouseover", function(event, d) {
      tooltip.transition().duration(200).style("opacity", .9);
      tooltip.html(`Año: ${d.year.getFullYear()}<br>Valor: ${d.value.toFixed(2)}`)
        .style("left", (event.pageX + 5) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function() {
      tooltip.transition().duration(500).style("opacity", 0);
    });

  circles.attr("cx", d => x(d.year))
    .attr("cy", d => y(d.value))
    .style("fill", (d, i, nodes) => d3.select(nodes[i].parentNode).select("path").style("stroke"));

  circles.exit().remove();

  const legend = d3.select("#legend");
  legend.selectAll("*").remove();

  const legendItems = legend.selectAll(".legend-item")
    .data(data, d => d.name);

  const legendEnter = legendItems.enter().append("div")
    .attr("class", "legend-item")
    .style("display", "inline-block")
    .style("margin-right", "10px");

  legendEnter.append("span")
    .style("background-color", (d, i) => d3.schemeCategory10[i])
    .style("width", "12px")
    .style("height", "12px")
    .style("display", "inline-block")
    .style("margin-right", "5px");

  legendEnter.append("span")
    .text(d => d.name);

  legendItems.exit().remove();
}

function updateLineChart(departamento) {
  lineChartContainer.selectAll("*").remove();
  drawLineChart(geojsonData.csvData, departamento);
}

let geojsonData;
loadData("Archivos/MGN_ANM_DPTOS.geojson", "Archivos/TerriData_Dim4.csv").then(data => {
  geojsonData = data;
  drawMap(geojsonData.geojson, atributos[0]);
  drawLineChart(geojsonData.csvData);
});

function updateMap() {
  const selectedAttribute = d3.select("#atributoSelect").property("value");
  drawMap(geojsonData.geojson, selectedAttribute);
}