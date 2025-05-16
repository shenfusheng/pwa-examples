// Generating content based on the template
const template = `<article>
  <img src='data/img/placeholder.png' data-src='data/img/SLUG.jpg' alt='NAME'>
  <h3>#POS. NAME</h3>
  <ul>
  <li><span>Author:</span> <strong>AUTHOR</strong></li>
  <li><span>Twitter:</span> <a href='https://twitter.com/TWITTER'>@TWITTER</a></li>
  <li><span>Website:</span> <a href='http://WEBSITE/'>WEBSITE</a></li>
  <li><span>GitHub:</span> <a href='https://GITHUB'>GITHUB</a></li>
  <li><span>More:</span> <a href='http://js13kgames.com/entries/SLUG'>js13kgames.com/entries/SLUG</a></li>
  </ul>
</article>`;
let content = "";
for (let i = 0; i < games.length; i++) {
  let entry = template
    .replace(/POS/g, i + 1)
    .replace(/SLUG/g, games[i].slug)
    .replace(/NAME/g, games[i].name)
    .replace(/AUTHOR/g, games[i].author)
    .replace(/TWITTER/g, games[i].twitter)
    .replace(/WEBSITE/g, games[i].website)
    .replace(/GITHUB/g, games[i].github);
  entry = entry.replace("<a href='http:///'></a>", "-");
  content += entry;
}
document.getElementById("content").innerHTML = content;
document.getElementById("version").innerText = "new version 3";

// Registering Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/pwa-examples/js13kpwa/sw.js");
}

// Requesting permission for Notifications after clicking on the button
const button = document.getElementById("notifications");
button.addEventListener("click", () => {
  Notification.requestPermission().then((result) => {
    if (result === "granted") {
      randomNotification();
    }
  });
});

// Setting up random Notification
function randomNotification() {
  const randomItem = Math.floor(Math.random() * games.length);
  const notifTitle = games[randomItem].name;
  const notifBody = `Created by ${games[randomItem].author}.`;
  const notifImg = `data/img/${games[randomItem].slug}.jpg`;
  const options = {
    body: notifBody,
    icon: notifImg,
  };
  new Notification(notifTitle, options);
  setTimeout(randomNotification, 30000);
}

// Progressive loading images
const imagesToLoad = document.querySelectorAll("img[data-src]");
const loadImages = (image) => {
  image.setAttribute("src", image.getAttribute("data-src"));
  image.onload = () => {
    image.removeAttribute("data-src");
  };
};
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((items) => {
    items.forEach((item) => {
      if (item.isIntersecting) {
        loadImages(item.target);
        observer.unobserve(item.target);
      }
    });
  });
  imagesToLoad.forEach((img) => {
    observer.observe(img);
  });
} else {
  imagesToLoad.forEach((img) => {
    loadImages(img);
  });
}
console.log("new version");

// Add update notification functionality
document.addEventListener("DOMContentLoaded", () => {
  // Create UI elements for the update notification
  const updateContainer = document.createElement("div");
  updateContainer.className = "update-notification";
  updateContainer.style.display = "none";
  updateContainer.innerHTML = `
    <div class="update-content">
      <p>A new version is available!</p>
      <button id="update-button">Refresh to update</button>
    </div>
  `;
  document.body.appendChild(updateContainer);

  // Style the update notification
  const style = document.createElement("style");
  style.textContent = `
    .update-notification {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #2196F3;
      color: white;
      padding: 1rem;
      display: flex;
      justify-content: center;
      align-items: center;
      box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.2);
      z-index: 1000;
      transform: translateY(100%);
      transition: transform 0.3s ease-out;
    }
    .update-notification.visible {
      transform: translateY(0);
    }
    .update-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      max-width: 600px;
    }
    #update-button {
      background: white;
      color: #2196F3;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    }
    #update-button:hover {
      background: #e3f2fd;
    }
  `;
  document.head.appendChild(style);

  // Add event listener for the update button
  document.getElementById("update-button").addEventListener("click", () => {
    // Tell the service worker we're applying updates
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "CLEAR_UPDATES",
      });
    }
    // Reload the page to apply updates
    window.location.reload();
  });

  // Listen for update messages from the service worker
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "UPDATE_AVAILABLE") {
      console.log("Update available:", event.data.updatedResources);

      // Show the update notification
      updateContainer.style.display = "flex";
      // Use setTimeout to ensure the browser has time to apply the display change
      // before we add the 'visible' class for the transition
      setTimeout(() => {
        updateContainer.classList.add("visible");
      }, 10);
    }
  });
});
