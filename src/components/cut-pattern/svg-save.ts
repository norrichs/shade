function show_svg(evt) {
  var svg = document.getElementById("output-pic");
  var serializer = new XMLSerializer();
  var svg_blob = new Blob([serializer.serializeToString(svg)],
                          {'type': "image/svg+xml"});
  var url = URL.createObjectURL(svg_blob);

  var svg_win = window.open(url, "svg_win");
}