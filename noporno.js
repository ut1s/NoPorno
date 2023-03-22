find();

function find() {
  let href = window.location.href;
  for(let i = 0; i <= badsites.length; i++){
    if (href.includes(badsites[i])) {
      flush();
      //window.location.replace(goodsites[Math.floor(Math.random()*goodsites.length)]);
    }
  }
}

function flush() {
  document.open();
  document.write(bsite);
  document.close();
}