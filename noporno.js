findAllURL = function changeAllURL(text) {
  var current = window.location.href;
  if (current.startsWith(text)) {
    document.documentElement.innerHTML = "";
    document.documentElement.innerHTML = "Domain is blocked";
    document.documentElement.scrollTop = 0;
  }
};
findURL = function changeURL(text) {
  var current = window.location.href;
  if (current === text) {
    window.location.replace("https://www.google.co.in");
  }
};

findURL("https://www.quora.com/");
findAllURL("https://www.facebook.com/");
