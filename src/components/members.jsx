import React, { Component } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import MembersTable from "./membersTable";
import Pagination from "./common/pagination";
import { getMembers, deleteMember } from "../services/memberService";
import { paginate } from "../utils/paginate";
import _ from "lodash";
import SearchBox from "./common/searchBox";
//import "./members.scss";

class Members extends Component {
  state = {
    members: [],
    currentPage: 1,
    pageSize: 4,
    searchQuery: "",
    sortColumn: { path: "name", order: "asc" },
  };

  async componentDidMount() {
    // const { data } = await getGenres();
    // const genres = [{ _id: "", name: "All Genres" }, ...data];

    const { data: members } = await getMembers();
    this.setState({ members });
  }

  handleDelete = async (member) => {
    const originalMembers = this.state.members;
    const members = originalMembers.filter((m) => m._id !== member._id);
    this.setState({ members });

    try {
      await deleteMember(member._id);
    } catch (ex) {
      if (ex.response && ex.response.status === 404)
        toast.error("This member has already been deleted.");

      this.setState({ members: originalMembers });
    }
  };

  handlePageChange = (page) => {
    this.setState({ currentPage: page });
  };

  handleSearch = (query) => {
    this.setState({ searchQuery: query, currentPage: 1 });
  };

  handleSort = (sortColumn) => {
    this.setState({ sortColumn });
  };

  getPagedData = () => {
    const {
      pageSize,
      currentPage,
      sortColumn,
      searchQuery,
      members: allMembers,
    } = this.state;

    let filtered = allMembers;
    if (searchQuery)
      filtered = allMembers.filter((m) =>
        m.name.toLowerCase().startsWith(searchQuery.toLowerCase())
      );
    //else if (selectedGenre && selectedGenre._id)
    //  filtered = allMovies.filter((m) => m.genre._id === selectedGenre._id);

    const sorted = _.orderBy(filtered, [sortColumn.path], [sortColumn.order]);

    const members = paginate(sorted, currentPage, pageSize);

    return { totalCount: filtered.length, data: members };
  };

  render() {
    const { length: count } = this.state.members;
    const { pageSize, currentPage, sortColumn, searchQuery } = this.state;

    if (count === 0) return <p>There are no members in the database.</p>;

    const { totalCount, data: members } = this.getPagedData();

    return (
      <div className="container">
        <div className="row">
          <h1>Members</h1>
          <div className="col">
            <div className="button">
              <Link
                to="/members/new"
                className="btn"
                style={{ marginBottom: 20 }}
              >
                New Member
              </Link>
            </div>
            <p>Showing {totalCount} members in the database.</p>
            <SearchBox value={searchQuery} onChange={this.handleSearch} />
            <MembersTable
              className="content"
              members={members}
              sortColumn={sortColumn}
              onDelete={this.handleDelete}
              onSort={this.handleSort}
            />
            <Pagination
              itemsCount={totalCount}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={this.handlePageChange}
            />
          </div>
        </div>
      </div>
    );
  }
}

export default Members;
