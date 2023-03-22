// Starts here
find();

// This finds the bad sites and then executes the script
function find() {
  let href = window.location.href;
  for(let i = 0; i <= badsites.length; i++){
    if (href.includes(badsites[i])) {
      console.log("flush!");
      flush();
      console.log("flushed");
      wait(1);
      console.log("timed");
      wait(3000);
      redirect();
    }
  }
}


// This flushed the site's content and refills with a nice message
function flush() {
  document.open();
  document.write("");
  document.write(bsite);
  document.close();
}


// Wait script is from https://stackoverflow.com/a/33414145
// Thank you Mic & Trisped, great stack overflow users!
// This is a wait function
function wait(ms){
  var start = new Date().getTime();
  var end = start;
  while(end < start + ms) {
    end = new Date().getTime();
 }
}

// This manages the redirects to a random site from list
function redirect () {
  window.location.replace(goodsites[Math.floor(Math.random()*goodsites.length)]);
}