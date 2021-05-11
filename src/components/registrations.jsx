import React, { Component } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import RegisterTable from "./registerTable";
import Pagination from "./common/pagination";
import { getRegisters, deleteRegister } from "../services/registerService";
import { paginate } from "../utils/paginate";
import _ from "lodash";
import SearchBox from "./common/searchBox";
//import "./registers.scss";

class Registrations extends Component {
  state = {
    registers: [],
    currentPage: 1,
    pageSize: 4,
    searchQuery: "",
    sortColumn: { path: "name", order: "asc" },
  };

  async componentDidMount() {
    // const { data } = await getGenres();
    // const genres = [{ _id: "", name: "All Genres" }, ...data];

    const { data: registers } = await getRegisters();
    this.setState({ registers });
  }

  handleDelete = async (register) => {
    const originalRegisters = this.state.registers;
    const registers = originalRegisters.filter((r) => r._id !== register._id);
    this.setState({ registers });

    try {
      await deleteRegister(register._id);
    } catch (ex) {
      if (ex.response && ex.response.status === 404)
        toast.error("This register has already been deleted.");

      this.setState({ registers: originalRegisters });
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
      registers: allRegisters,
    } = this.state;

    let filtered = allRegisters;
    if (searchQuery)
      filtered = allRegisters.filter((r) =>
        r.name.toLowerCase().startsWith(searchQuery.toLowerCase())
      );
    //else if (selectedGenre && selectedGenre._id)
    //  filtered = allMovies.filter((r) => r.genre._id === selectedGenre._id);

    const sorted = _.orderBy(filtered, [sortColumn.path], [sortColumn.order]);

    const registers = paginate(sorted, currentPage, pageSize);

    return { totalCount: filtered.length, data: registers };
  };

  render() {
    const { length: count } = this.state.registers;
    const { pageSize, currentPage, sortColumn, searchQuery } = this.state;

    if (count === 0) return <p>There are no registers in the database.</p>;

    const { totalCount, data: registers } = this.getPagedData();

    return (
      <div className="container">
        <div className="row">
          <h1>Registrations</h1>
          <div className="col">
            <div className="button">
              <Link
                to="/registers/new"
                className="btn"
                style={{ marginBottom: 20 }}
              >
                New Register
              </Link>
            </div>
            <p>Showing {totalCount} registers in the database.</p>
            <SearchBox value={searchQuery} onChange={this.handleSearch} />
            <RegisterTable
              className="content"
              registers={registers}
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

export default Registrations;
