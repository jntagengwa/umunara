import React, { Component } from "react";
import auth from "../services/authService";
import Table from "./common/table";

class RegisterTable extends Component {
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
    content: (register) => (
      <button
        onClick={() => this.props.onDelete(register)}
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
    const { registers, onSort, sortColumn } = this.props;

    return (
      <Table
        columns={this.columns}
        data={registers}
        sortColumn={sortColumn}
        onSort={onSort}
      />
    );
  }
}

export default RegisterTable;
