import React, { Component } from "react";
import auth from "../services/authService";
import { Link } from "react-router-dom";
import Table from "./common/table";

class MembersTable extends Component {
  columns = [
    {
      path: "name",
      label: "Name",
      content: (member) => (
        <Link to={`/members/${member._id}`}>{member.name}</Link>
      ),
    },
    { path: "number", label: "Phone Number" },
    { path: "email", label: "Email" },
    { path: "denomination", label: "Denomination" },
  ];

  deleteColumn = {
    key: "delete",
    content: (member) => (
      <button
        onClick={() => this.props.onDelete(member)}
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
    const { members, onSort, sortColumn } = this.props;

    return (
      <Table
        columns={this.columns}
        data={members}
        sortColumn={sortColumn}
        onSort={onSort}
      />
    );
  }
}

export default MembersTable;
