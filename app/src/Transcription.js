import "./Transcription.css";
import { useState } from "react";
import Navbar from "./components/Navbar";
import axios from "axios";
import { API_BASE_URL } from "./config";
import InfoIcon from "./components/InfoIcon";
import FileDropComponent from "./components/FileDropComponent";

function Transcription() {
  const [audioFile, setAudioFile] = useState(null);
  const [speakerSection, setSpeakerSection] = useState(false);
  const [transcriptFilename, setTranscriptFilename] = useState("");
  const [speakersSummary, setSpeakersSummary] = useState({});
  const [speakerNames, setSpeakerNames] = useState({});
  const [fileUploading, setFileUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [prompt, setPrompt] = useState("");

  const resetState = () => {
    setAudioFile(null);
    setSpeakerSection(false);
    setTranscriptFilename("");
    setSpeakersSummary({});
    setSpeakerNames({});
    setFileUploading(false);
    setIsLoading(false);
    setPrompt("");
  };

  const onAudioFileUpload = (extractedColumns, uploadedFile) => {
    setAudioFile(uploadedFile);
    setFileUploading(false);
  };

  const handleSpeakerNameChange = (speakerKey, newName) => {
    setSpeakerNames((prevNames) => ({
      ...prevNames,
      [speakerKey]: newName,
    }));
  };

  const transcribeAudio = async () => {
    setIsLoading(true);
    const formData = new FormData();
    if (audioFile) {
      const allowedTypes = [
        "audio/mpeg",
        "audio/mp4",
        "audio/wav",
        "audio/x-m4a",
        "audio/aac",
        "audio/ogg",
        "video/mp4",
        "audio/mp3",
      ];
      if (allowedTypes.includes(audioFile.type)) {
        formData.append("audio_input", audioFile);
        formData.append("prompt", prompt);
      } else {
        alert(
          "Only MP3, MP4, WAV, M4A, AAC, and OGG files are allowed at the moment"
        );
        return 0;
      }
    } else {
      return 0;
    }
    try {
      setFileUploading(true);
      const data = await axios
        .post(`${API_BASE_URL}/transcription/mp3`, formData)
        .then((response) => {
          const initialSpeakerNames = {}; // Initialize an empty object for speaker names
          setSpeakersSummary(response.data.summaries);

          Object.keys(response.data.summaries).forEach((speakerKey, index) => {
            initialSpeakerNames[speakerKey] = `Speaker ${index}`; // Set default names like "Speaker 0", "Speaker 1"
          });

          console.log(initialSpeakerNames);
          setSpeakerNames(initialSpeakerNames);
          setTranscriptFilename(response.data.message);
        })
        .finally(() => {
          setSpeakerSection(true);
          setIsLoading(false);
        });
    } catch (error) {
      console.error("There was an error uploading the data:", error);
      setFileUploading(false);
      setIsLoading(false);
    }
  };

  const updateSpeakers = async () => {
    console.log(speakerNames);
    console.log(transcriptFilename);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/transcription/add_speakers_and_send`,
        {
          filename: transcriptFilename,
          speaker_names: speakerNames,
        },
        {
          responseType: "blob",
        }
      );

      // Creating a URL for the blob
      const fileURL = window.URL.createObjectURL(new Blob([response.data]));

      // Creating a temporary link element
      const fileLink = document.createElement("a");

      fileLink.href = fileURL;
      fileLink.setAttribute("download", transcriptFilename); // or another filename you want
      document.body.appendChild(fileLink);

      fileLink.click(); // Simulate click on the link to start download

      document.body.removeChild(fileLink); // Clean-up
    } catch (error) {
      console.error("There was an error uploading the data:", error);
    } finally {
      return 1;
    }
  };

  return (
    <>
      <Navbar />
      <div className="script-main-div">
        <div className="script-main-content">
          {!speakerSection ? (
            <div className="script-holder">
              <div className="toyota-file-drop">
                <FileDropComponent
                  onFileUpload={onAudioFileUpload}
                  className="file-area"
                />
                <div className="script-second-content">
                  <div className="transcript-label-div">
                    <label style={{ color: "#888888" }}>Keywords</label>
                    <InfoIcon text="Place proper nouns and acronyms here the way you wish them to be displayed. The AI will keep this in mind when generating your transcript. Any format is fine. (CURRENTLY NOT WORKING)" />
                  </div>
                  <input
                    type="text"
                    defaultValue={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="transcript-input"
                    style={{ cursor: "not-allowed" }}
                    disabled
                  />
                  <button
                    className={`transcript-btn ${
                      fileUploading ? "script-disabled" : ""
                    }`}
                    onClick={transcribeAudio}
                  >
                    Transcribe Audio
                  </button>
                </div>
              </div>
              <div className="script-third-content">
                <div className="script-description-section">
                  {!isLoading ? (
                    <>
                      {" "}
                      <h2>Audio Transcription Service</h2>
                      <p>
                        This tool is used to convert an mp3 audio file into a
                        transcript. File processing may take multiple minutes
                        depending on file size. Utilize the Keywords field to
                        ensure proper nouns and acronyms are spelled correctly
                        on the final transcript. Once the file is processed,
                        edit the generated speaker names based on the first 3
                        spoken lines from a given speaker.
                      </p>
                    </>
                  ) : (
                    <div className="spinner"></div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="script-holder-2">
              {speakerSection && (
                <div className="script-speaker-section">
                  {Object.entries(speakersSummary).map(
                    ([speakerKey, lines], index) => (
                      <div key={index} className="speaker-summary">
                        <input
                          type="text"
                          placeholder={`Speaker ${index}`}
                          value={speakerNames[speakerKey] || ""}
                          onChange={(e) =>
                            handleSpeakerNameChange(speakerKey, e.target.value)
                          }
                        />
                        <p>{lines}</p>
                      </div>
                    )
                  )}
                  <div className="transcript-btn-section">
                    <button
                      className="transcript-btn right-side-btn"
                      onClick={updateSpeakers}
                    >
                      Submit Speakers
                    </button>
                    <button className="reset-btn" onClick={resetState}>
                      Reset and Upload New File
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default Transcription;
