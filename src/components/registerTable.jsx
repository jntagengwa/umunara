import React, { Component } from "react";
import auth from "../services/authService";
import Table from "./common/table";

class RegistrationTable extends Component {
  columns = [
    { path: "firstName", label: "First Name" },
    { path: "lastName", label: "Last Name" },
    { path: "email", label: "Email" },
    { path: "homeChurch", label: "Home Church" },
    { path: "thoughts", label: "Thoughts" },
    { path: "hopes", label: "Hopes" },
    { path: "getInvolved", label: "Interested" },
  ];

  deleteColumn = {
    key: "delete",
    content: (registration) => (
      <button
        onClick={() => this.props.onDelete(registration)}
        className="btn btn-sm"
        style={{ backgroundColor: "rgb(255, 59, 48)", color: "white" }}
      >
        Delete
      </button>
    ),
  };

  constructor() {
    super();
    const user = auth.getCurrentUser();
    if (user && user.isAdmin) this.columns.push(this.deleteColumn);
  }

  render() {
    const { registrations, onSort, sortColumn } = this.props;

    return (
      <Table
        columns={this.columns}
        data={registrations}
        sortColumn={sortColumn}
        onSort={onSort}
      />
    );
  }
}

export default RegistrationTable;
