var goodsites = [
  "https://music.youtube.com",
  "https://open.spotify.com/",
  "https://toliver.hu",
  "https://www.urbandictionary.com/define.php?term=Porn",
  "https://www.urbandictionary.com/define.php?term=Pornhub",
];

function randomsite() {
  if (isPopupOpen) {
    window.open(goodsites[Math.floor(Math.random() * goodsites.length)], "_blank");
  }
};

// Get the current count from storage, or set it to 0 if it doesn't exist
chrome.storage.sync.get("count", function (result) {
  let count = result.count || 0;
  document.getElementById("count").textContent = count;
});
// Update the count in the popup whenever it changes in storage
chrome.storage.onChanged.addListener(function (changes, namespace) {
  if (namespace === "sync" && changes.count) {
    document.getElementById("count").textContent = changes.count.newValue;
  }
});

/*
function isopen() {
  const views = chrome.extension.getViews({ type: 'popup' });
  return views.length > 0;
};*/

/*

document.getElementsByClassName("click").addEventListener("click", randomsite());*/