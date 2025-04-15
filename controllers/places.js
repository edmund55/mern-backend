const fs = require("fs");
const mongoose = require("mongoose");
const { validationResult } = require("express-validator");

const {
  NotFoundError,
  BadRequestError,
  CustomError,
  UnauthenticatedError,
} = require("../errors");
const getCoordsForAddress = require("../util/location");
const Place = require("../models/Place");
const User = require("../models/User");

const getPlaceById = async (req, res) => {
  const { pid } = req.params;
  let place;
  try {
    place = await Place.findById(pid);
  } catch (err) {
    const error = new CustomError(
      "Something went wrong, could not find a place."
    );
    return next(error);
  }
  if (!place) {
    throw new NotFoundError(
      `Could not find a place for the provided id ${pid}`
    );
  }

  res.status(200).json({ place });
};

const getPlacesByUserId = async (req, res, next) => {
  const { uid } = req.params;

  let userWithPlaces;
  try {
    userWithPlaces = await User.findById(uid).populate("places");
  } catch (err) {
    return next(
      new CustomError("Fetching places failed, please try again later.")
    );
  }

  if (!userWithPlaces) {
    return next(
      new NotFoundError("Could not find places for the provided user id.")
    );
  }

  res.status(200).json({
    places: userWithPlaces.places,
    count: userWithPlaces.length,
  });
};

const createPlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new BadRequestError("Invalid inputs passed, please check your data.")
    );
  }

  const { title, description, address } = req.body;
  const { userId } = req.userData;
  // default coordinates for all places:
  const location = {
    lat: 40.7484474,
    lng: -73.9871516,
  };

  // **Google geocoding api require a biling account**
  //const coordintes = await getCoordsForAddress(address);

  const createdPlace = new Place({
    title,
    description,
    address,
    location,
    image: req.file.path,
    creator: userId,
  });

  let user;
  try {
    user = await User.findById(userId);
  } catch (error) {
    return next(new CustomError("Create place failed."));
  }

  if (!user) {
    throw new NotFoundError(`Could not find user with id ${userId}.`);
  }

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await createdPlace.save({ session: sess });
    user.places.push(createdPlace);
    await user.save();
    await sess.commitTransaction();
  } catch (error) {
    return next(new CustomError("Create place failed. (2)"));
  }

  res.status(201).json({ place: createdPlace });
};

const updatePlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new BadRequestError("Invalid inputs passed, please check your data.");
  }
  const { pid } = req.params;
  const { title, description } = req.body;
  const { userId } = req.userData;

  if (!title || !description) {
    throw new BadRequestError("Please provide title and description.");
  }

  // const updatedPlace = await Place.findOneAndUpdate(
  //   { _id: pid, creator: userId },
  //   { title, description },
  //   { new: true }
  // );

  let place;
  try {
    place = await Place.findById(pid);
  } catch (err) {
    const error = new CustomError(
      "Something went wrong, could not update place."
    );
    return next(error);
  }

  if (!place) {
    throw new NotFoundError(
      `Could not find a place for the provided place id ${pid}`
    );
  }

  if (place.creator.toString() !== userId) {
    const error = new UnauthenticatedError(
      "You are not allowed to edit this place."
    );
    return next(error);
  }

  place.title = title;
  place.description = description;

  try {
    await place.save();
  } catch (err) {
    const error = new CustomError(
      "Something went wrong, could not update place."
    );
    return next(error);
  }

  return res.status(200).json({ place });
};

const deletePlace = async (req, res, next) => {
  const { pid } = req.params;
  const { userId } = req.userData;

  let deletedPlace;
  try {
    deletedPlace = await Place.findById(pid).populate("creator");
  } catch (error) {
    return next(new CustomError("Delete place failed."));
  }

  if (!deletedPlace) {
    throw new NotFoundError(
      `Could not find a place for the provided place id ${pid}`
    );
  }

  if (deletedPlace.creator._id.toString() !== userId) {
    throw new UnauthenticatedError("You are not allowed to delete this place.");
  }

  const imagePath = deletedPlace.image;

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await deletedPlace.deleteOne({ session: sess });
    deletedPlace.creator.places.pull(deletedPlace);
    await deletedPlace.creator.save({ session: sess });
    await sess.commitTransaction();
  } catch (error) {
    return next(new CustomError("Delete place failed. (2)"));
  }

  fs.unlink(imagePath, (err) => {
    console.log(err);
  });

  return res.status(200).json({ place: deletedPlace });
};

module.exports = {
  getPlaceById,
  getPlacesByUserId,
  createPlace,
  updatePlace,
  deletePlace,
};
