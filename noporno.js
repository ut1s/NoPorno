// Starts here
find();

// This finds the bad sites and then executes the script
function find() {
  let href = window.location.href;
  let dname = window.location.hostname;
  for(let i = 0; i <= reddithref.length; i++){
    if (href.includes(reddithref[i])) {
      for(let i = 0; i <= subreddits.length; i++){
        if (href.includes(subreddits[i])) {
          console.log("flush!");
          flush(rsite);
          console.log("flushed");
          store();
          console.log("stored");
          wait(4000);
          console.log("timed");
          redirect();
        }
      }
    }
  }
  for(let i = 0; i <= baddwords.length; i++){
    if (dname.includes(baddwords[i])) {
      console.log("flush!");
      flush(bsite);
      console.log("flushed");
      store();
      console.log("stored");
      wait(4000);
      console.log("timed");
      redirect();
    }
  }
  for(let i = 0; i <= badsites.length; i++){
    if (href.includes(badsites[i])) {
      console.log("flush!");
      flush(bsite);
      console.log("flushed");
      store();
      console.log("stored");
      wait(4000);
      console.log("timed");
      redirect();
    }
  }
}


// This flushed the site's content and refills with a nice message
function flush(what) {
  document.open();
  document.write("");
  document.write(what);
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

// Adds +1 after a successful ban
function store(){
  chrome.storage.sync.get("count", function(result) {
    let count = result.count || 0;
    count++;
    chrome.storage.sync.set({ "count": count }, function() {
      console.log("Sites banned: " + count);
    });
  });
}