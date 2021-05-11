import http from "./httpService";
import { apiUrl } from "../config.json";

const apiEndpoint = apiUrl + "/registrations";

function registrationUrl(id) {
  return `${apiEndpoint}/${id}`;
}

export function getRegistrations() {
  return http.get(apiEndpoint);
}

export function getRegistration(registrationId) {
  return http.get(registrationUrl(registrationId));
}

export function saveRegistration(registration) {
  if (registration._id) {
    const body = { ...registration };
    delete body._id;
    return http.put(registrationUrl(registration._id), body);
  }

  return http.post(apiEndpoint, registration);
}

export function deleteRegistration(registrationId) {
  return http.delete(registrationUrl(registrationId));
}
