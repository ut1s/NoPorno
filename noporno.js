find();

function find() {
  let href = window.location.href;
  for(let i = 0; i <= badsites.length; i++){
    if (href.includes(badsites[i])) {
      window.stop();
      window.location.replace(goodsites[Math.floor(Math.random()*goodsites.length)]);
    }
  }
}

function flush() {
  document.body.innerHTML = "";
  
}