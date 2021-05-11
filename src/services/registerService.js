import http from "./httpService";
import { apiUrl } from "../config.json";

const apiEndpoint = apiUrl + "/registers";

function registerUrl(id) {
  return `${apiEndpoint}/${id}`;
}

export function getRegisters() {
  return http.get(apiEndpoint);
}

export function getRegister(registerId) {
  return http.get(registerUrl(registerId));
}

export function saveRegister(register) {
  if (register._id) {
    const body = { ...register };
    delete body._id;
    return http.put(registerUrl(register._id), body);
  }

  return http.post(apiEndpoint, register);
}

export function deleteRegister(registerId) {
  return http.delete(registerUrl(registerId));
}
