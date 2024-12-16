let start_button = document.getElementById("start_button");
let stop_button = document.getElementById("stop_button");
let converted_text = document.getElementById("converted_text");
let clear_button = document.getElementById("clear_button");
let copy_button = document.getElementById("copy_button");

let recognition;
let isListening = false;

start_button.addEventListener("click", function () {
  if (!isListening) {
    window.SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.interimResults = true;

    recognition.addEventListener("result", (e) => {
      const transcript = Array.from(e.results)
        .map((result) => result[0])
        .map((result) => result.transcript)
        .join("");
     
      converted_text.value += transcript;
    });

    recognition.addEventListener("end", () => {
      if (isListening) {
        recognition.start();
      }
    });

    recognition.start();
    isListening = true;
  }
});

stop_button.addEventListener("click", function () {
  if (isListening) {
    recognition.stop();
    isListening = false;
  }
});

clear_button.addEventListener("click", function () {
  converted_text.value = ""; 
});

copy_button.addEventListener("click", function () {
  navigator.clipboard
    .writeText(converted_text.value)
    .then(() => {})
    .catch((err) => {
      console.error("Failed to copy text: ", err);
    });
});
