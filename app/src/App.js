import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PrivateRoute from "./PrivateRoute";
import Heatmap from "./Heatmap";
import Homepage from "./Homepage";
import ToyotaMedia from "./ToyotaMedia";
import AdminTools from "./AdminPage";
import Login from "./Login";
import CreateAccount from "./CreateAccount";
import BeauJoke from "./BeauJoke";
import LTRedirect from "./LTRedirect";
import BCMediaTool from "./BCMediaTool";
import CocopahDB from "./CocopahDB";
import Transcription from "./Transcription";
import SowUpload from "./SowUpload";
import SowChatBot from "./SowChatBot";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/create-account/:token" element={<CreateAccount />} />
        <Route path="/dashboard" element={<Homepage />} exact />
        <Route
          path="/zipcode_heatmap"
          element={
            <PrivateRoute>
              <Heatmap />
            </PrivateRoute>
          }
          exact
        />
        <Route
          path="/toyota_media_buy_processing"
          element={
            <PrivateRoute>
              <ToyotaMedia />
            </PrivateRoute>
          }
          exact
        />
        <Route
          path="/bc-media-tool"
          element={
            <PrivateRoute>
              <BCMediaTool />
            </PrivateRoute>
          }
          exact
        />
        <Route
          path="/admin_tools"
          element={
            <PrivateRoute>
              <AdminTools />
            </PrivateRoute>
          }
          exact
        />
        <Route
          path="/beau_joke"
          element={
            <PrivateRoute>
              <BeauJoke />
            </PrivateRoute>
          }
          exact
        />
        <Route
          path="/lt_redirect"
          element={
            <PrivateRoute>
              <LTRedirect />
            </PrivateRoute>
          }
          exact
        />
        <Route
          path="/cocopah_database_management"
          element={
            <PrivateRoute>
              <CocopahDB />
            </PrivateRoute>
          }
          exact
        />
        <Route
          path="/transcription"
          element={
            <PrivateRoute>
              <Transcription />
            </PrivateRoute>
          }
          exact
        />
        <Route
          path="/sow_upload"
          element={
            <PrivateRoute>
              <SowUpload />
            </PrivateRoute>
          }
          exact
        />
        <Route
          path="/sow_chat_bot"
          element={
            <PrivateRoute>
              <SowChatBot />
            </PrivateRoute>
          }
          exact
        />
        <Route path="*" element={<Login />} exact />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
