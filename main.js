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
      let finalTranscript = "";
      let interimTranscript = "";

      Array.from(e.results).forEach((result) => {
        if (result.isFinal) {
          finalTranscript += result[0].transcript; 
        } else {
          interimTranscript += result[0].transcript; 
        }
      });

      if (finalTranscript) {
        converted_text.value += finalTranscript + " ";
      }
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
