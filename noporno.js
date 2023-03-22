find();

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

function flush() {
  document.open();
  document.write("");
  document.write(bsite);
  document.close();
}


// Wait script is from https://stackoverflow.com/a/33414145
// Thank you Mic & Trisped, great stack overflow users!
function wait(ms){
  var start = new Date().getTime();
  var end = start;
  while(end < start + ms) {
    end = new Date().getTime();
 }
}

function redirect () {
  window.location.replace(goodsites[Math.floor(Math.random()*goodsites.length)]);
}